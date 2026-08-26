export function scaffoldNotImplemented(name: string): never {
  throw new Error(`${name} is not implemented`);
}
