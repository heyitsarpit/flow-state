#!/usr/bin/perl
# Per Spec: invariants that no test in the tests section cites.
use strict; use warnings;
for my $f (glob "/Users/arpit/Developer/flow-state/workflow/specs/core/*.spec") {
  open my $h, '<', $f or die; my @l = <$h>;
  my (%inv, $intests, $tests);
  my $sec = "";
  for (@l) {
    $sec = $1 if /^(\w+)\s*$/;
    $inv{$1} = 1 if $sec eq "invariants" && /^    (I\d+)\s/;
    $tests .= $_ if $sec eq "tests";
  }
  $tests //= "";
  my @miss = grep { $tests !~ /\@$_\b/ } sort { substr($a,1) <=> substr($b,1) } keys %inv;
  my $n = scalar keys %inv;
  printf "%s: %d invariants, untested: %s\n", ($f =~ s{.*/}{}r), $n, join(" ", @miss);
}
