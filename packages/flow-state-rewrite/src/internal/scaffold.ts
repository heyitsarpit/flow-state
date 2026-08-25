export function scaffoldNotImplemented(name: string): never {
  throw new Error(`flow-state-rewrite scaffold: ${name} is not implemented`);
}
