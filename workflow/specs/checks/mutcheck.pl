#!/usr/bin/perl
# For every backticked id cited in workflow/specs/core/*.spec, find a single-line mutant definition
# m("id", "Dxx", "file", "find", ...) or { id: "id", ... edits: [["file", "find", ...
# and report whether the find string occurs in round-14/<file>.
use strict; use warnings;
my $root = "/Users/arpit/Developer/flow-state";
my $r14 = "$root/packages/flow-state-v3/prototypes/round-14";
my %cited;
for my $s (glob "$root/workflow/specs/core/*.spec") {
  open my $fh, '<', $s or die; my $n = 0;
  while (<$fh>) { $n++; while (/`([a-z0-9][\w.\-]*\.[\w.\-]+)`/g) { push @{$cited{$1}}, ($s =~ s{.*/}{}r) . ":$n" } }
}
my %def;
for my $f (glob "$r14/mutants*.ts") {
  open my $fh, '<', $f or die; local $/; my $t = <$fh>;
  my $b = $f =~ s{.*/}{}r;
  while ($t =~ /m\(\s*"([^"]+)",\s*"[^"]*",\s*"([^"]+\.ts)",\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/g) { $def{$1} //= [$b, $2, $3] }
  while ($t =~ /id:\s*"([^"]+)".{0,400}?edits:\s*\[\s*\[\s*"([^"]+\.ts)",\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/gs) { $def{$1} //= [$b, $2, $3] }
}
my ($ok, $rot, $nodef) = (0, 0, 0);
for my $id (sort keys %cited) {
  next unless exists $def{$id};
  my ($b, $file, $lit) = @{$def{$id}};
  my $q = substr($lit, 0, 1); my $find = substr($lit, 1, -1);
  if ($q eq '"' or $q eq "'") { $find =~ s/\\n/\n/g; $find =~ s/\\(["'\\])/$1/g; }
  my $path = "$r14/$file"; $path = "$root/packages/flow-state-v3/prototypes/conformance/$file" unless -e $path;
  my $src = do { local $/; open my $h, '<', $path or do { print "NOFILE $id $file\n"; next }; <$h> };
  if (index($src, $find) >= 0) { $ok++ } else { $rot++; print "ROTTED $id ($b -> $file) cited at @{$cited{$id}}\n" }
}
print "applies: $ok, rotted: $rot\n";
