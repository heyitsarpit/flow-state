#!/usr/bin/perl
# Read-only reference check for Specs and their records; `workflow check` does not resolve these.
#  1. Every @plan.Name.ID names a Plan under workflow/plans/ whose body has an entry ID.
#  2. Every @spec.Name.ID names a Spec under specs/ whose body has an entry ID.
#  3. In a .spec's tests section, every `backticked` token (a prototype case or wrong runtime id)
#     occurs in packages/flow-state-v3/prototypes/round-14 or .../conformance.
# Usage: perl spec-refcheck.pl FILE...   (run from the repository root). Exit 1 on any miss.
use strict;
use warnings;
use File::Find;

my (%plan, %spec);
sub header {
  my ($path, $kind) = @_;
  open(my $f, '<', $path) or return undef;
  my $first = <$f> // '';
  return $first =~ /^$kind\s+(\S+)/ ? $1 : undef;
}
find(sub { my $h; $plan{$h} = $File::Find::name if /\.plan$/ && defined($h = header($_, 'plan')) },
  'workflow/plans');
find(sub { my $h; $spec{$h} = $File::Find::name if /\.spec$/ && defined($h = header($_, 'spec')) },
  'specs');

my %ids;
sub ids_of {
  my ($path) = @_;
  return $ids{$path} if $ids{$path};
  open(my $f, '<', $path) or die "cannot read $path";
  my %h;
  while (<$f>) { $h{$1} = 1 if /^\s+([A-Z]+\d+)\s/ }
  return $ids{$path} = \%h;
}

my %proto;
sub in_prototype {
  my ($token) = @_;
  return $proto{$token} if exists $proto{$token};
  my $root = 'packages/flow-state-v3/prototypes';
  my $hit = system('grep', '-rqF', '--', $token, "$root/round-14", "$root/conformance") == 0;
  return $proto{$token} = $hit;
}

my $miss = 0;
for my $file (@ARGV) {
  open(my $f, '<', $file) or die "cannot read $file";
  my ($section, $n) = ('', 0);
  while (my $line = <$f>) {
    $n++;
    $section = $1 if $line =~ /^([a-z_]+)\b/;
    while ($line =~ /\@plan\.([A-Za-z]+)\.([A-Z]+\d+)/g) {
      my ($p, $id) = ($1, $2);
      if (!$plan{$p}) { print "$file:$n: no plan $p\n"; $miss++ }
      elsif (!ids_of($plan{$p})->{$id}) { print "$file:$n: \@plan.$p.$id not found\n"; $miss++ }
    }
    while ($line =~ /\@spec\.([A-Za-z]+)\.([A-Z]+\d+)/g) {
      my ($s, $id) = ($1, $2);
      if (!$spec{$s}) { print "$file:$n: no spec $s\n"; $miss++ }
      elsif (!ids_of($spec{$s})->{$id}) { print "$file:$n: \@spec.$s.$id not found\n"; $miss++ }
    }
    if ($file =~ /\.spec$/ && $section eq 'tests') {
      while ($line =~ /`([^`\s]+)`/g) {
        if (!in_prototype($1)) { print "$file:$n: prototype id `$1` not found\n"; $miss++ }
      }
    }
  }
}
print $miss ? "refcheck: $miss missing\n" : "refcheck: ok\n";
exit($miss ? 1 : 0);
