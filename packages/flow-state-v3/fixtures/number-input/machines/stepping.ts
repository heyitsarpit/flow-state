import { Schema } from "effect";

/**
 * Which way a step goes: down or up.
 */
export const Direction = Schema.Literals([-1, 1]);

/**
 * How far a step goes: the step, ten steps, or a tenth of one.
 */
export const Size = Schema.Literals(["step", "large", "small"]);

/**
 * The field's props, as its view passes them: bounds (null for none), a step (null for the
 * format's own), whether it is a percent and how many fraction digits it shows, and whether the
 * wheel steps it and whether it is disabled.
 */
export const Settings = Schema.Struct({
  min: Schema.NullOr(Schema.Number),
  max: Schema.NullOr(Schema.Number),
  step: Schema.NullOr(Schema.Number),
  percent: Schema.Boolean,
  fractionDigits: Schema.Number,
  wheel: Schema.Boolean,
  disabled: Schema.Boolean,
});

/**
 * The props a field has before its view sends any.
 */
export const defaults: typeof Settings.Type = {
  min: null,
  max: null,
  step: null,
  percent: false,
  fractionDigits: 0,
  wheel: false,
  disabled: false,
};

/**
 * A field's value: a number, or null while it is empty.
 */
export const Value = Schema.NullOr(Schema.Number);

type Amount = typeof Value.Type;

type Props = typeof Settings.Type;

type Way = typeof Direction.Type;

type Reach = typeof Size.Type;

const placesOf = (n: number) => {
  if (!Number.isFinite(n) || Number.isInteger(n)) return 0;
  const [digits = "", exponent = "0"] = String(n).toLowerCase().split("e");

  return Math.max(0, (digits.split(".")[1] ?? "").length - Number(exponent));
};

const rounded = (n: number, places: number) => Number(n.toFixed(Math.min(places, 100)));

const stepsBetween = (distance: number, size: number) => Number((distance / size).toPrecision(15));

/**
 * The step a field moves by: its own, or 1, or one percent at the digits a percent shows.
 */
export const stepOf = (props: Props) =>
  props.step ?? (props.percent ? 10 ** -(2 + props.fractionDigits) : 1);

const sizeOf = (props: Props, reach: Reach) => {
  if (reach === "large") return stepOf(props) * 10;

  return reach === "small" ? stepOf(props) / 10 : stepOf(props);
};

const baseOf = (props: Props) => props.min ?? 0;

const placesFor = (props: Props, size: number) => Math.max(placesOf(size), placesOf(baseOf(props)));

const lowest = (props: Props) => props.min ?? Number.NEGATIVE_INFINITY;

/**
 * The highest value on a grid of `size` from the field's base that is within its max.
 */
export const topOf = (props: Props, size = stepOf(props)) =>
  props.max === null
    ? Number.POSITIVE_INFINITY
    : rounded(
        baseOf(props) + Math.floor(stepsBetween(props.max - baseOf(props), size)) * size,
        placesFor(props, size),
      );

const within = (props: Props, n: number, size: number) =>
  Math.min(Math.max(n, lowest(props)), topOf(props, size));

/**
 * The nearest value on the step grid, within the bounds.
 */
export const snapped = (props: Props, n: number) => {
  const size = stepOf(props);
  const base = baseOf(props);
  const onGrid = base + Math.round(stepsBetween(n - base, size)) * size;

  return rounded(within(props, onGrid, size), placesFor(props, size));
};

const along = (props: Props, from: number, way: Way, size: number) => {
  const base = baseOf(props);
  const position = stepsBetween(from - base, size);

  const toward = way > 0 ? Math.floor(position) : Math.ceil(position);
  const start = Number.isInteger(position) ? position : toward;

  return rounded(within(props, base + (start + way) * size, size), placesFor(props, size));
};

/**
 * The value one step away: from 0 when empty; a large step lands on the step grid, the others on
 * their own grid; always within the bounds.
 */
export const stepFrom = (props: Props, value: Amount, way: Way, reach: Reach) => {
  if (value === null) return along(props, 0, way, stepOf(props));

  return reach === "large"
    ? snapped(props, value + way * sizeOf(props, "large"))
    : along(props, value, way, sizeOf(props, reach));
};

/**
 * Whether the value sits at the bound a step this way moves toward.
 */
export const atBound = (props: Props, value: Amount, way: Way, reach: Reach) => {
  if (value === null) return false;
  const grid = reach === "small" ? sizeOf(props, "small") : stepOf(props);

  return way > 0 ? value >= topOf(props, grid) : value <= lowest(props);
};

/**
 * The number typed text says, or null: plain digits, or a percent with or without its sign.
 */
export const parsed = (props: Props, text: string) => {
  const trimmed = text.trim();
  const digits = props.percent && trimmed.endsWith("%") ? trimmed.slice(0, -1).trim() : trimmed;
  const n = Number(digits);

  if (digits === "" || !Number.isFinite(n)) return null;

  return props.percent ? rounded(n / 100, placesOf(n) + 2) : n;
};
