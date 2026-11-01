// STAND-IN for viewer-badge.trait.ts (a trait; unchanged by v3). Only what the Presence definition and test touch.
export declare const ViewerBadge: {
  readonly each: (options: { readonly of: string; readonly max: number }) => {
    readonly copy: { readonly key: string; readonly fresh: boolean };
  };
};
