import { UnscopedValidationError } from './errors';
import { Token, Tokenization } from './token';

/**
 * Represents a length of time.
 *
 * The amount can be specified either as a literal value (e.g: `10`) which
 * cannot be negative, or as an unresolved number token.
 *
 * When the amount is passed as a token, unit conversion is not possible.
 */
export class Duration {
  /**
   * Create a Duration representing an amount of milliseconds
   *
   * @param amount the amount of Milliseconds the `Duration` will represent.
   * @returns a new `Duration` representing `amount` ms.
   */
  public static millis(amount: number): Duration {
    return new Duration(amount, TimeUnit.Milliseconds);
  }

  /**
   * Create a Duration representing an amount of seconds
   *
   * @param amount the amount of Seconds the `Duration` will represent.
   * @returns a new `Duration` representing `amount` Seconds.
   */
  public static seconds(amount: number): Duration {
    return new Duration(amount, TimeUnit.Seconds);
  }

  /**
   * Create a Duration representing an amount of minutes
   *
   * @param amount the amount of Minutes the `Duration` will represent.
   * @returns a new `Duration` representing `amount` Minutes.
   */
  public static minutes(amount: number): Duration {
    return new Duration(amount, TimeUnit.Minutes);
  }

  /**
   * Create a Duration representing an amount of hours
   *
   * @param amount the amount of Hours the `Duration` will represent.
   * @returns a new `Duration` representing `amount` Hours.
   */
  public static hours(amount: number): Duration {
    return new Duration(amount, TimeUnit.Hours);
  }

  /**
   * Create a Duration representing an amount of days
   *
   * @param amount the amount of Days the `Duration` will represent.
   * @returns a new `Duration` representing `amount` Days.
   */
  public static days(amount: number): Duration {
    return new Duration(amount, TimeUnit.Days);
  }

  /**
   * Parse a period formatted according to the ISO 8601 standard
   *
   * Days are the largest ISO duration supported, i.e.,
   * weeks, months, and years are not supported.
   *
   * @example
   * // This represents 1 day, 2 hours, 3 minutes, 4 seconds, and 567 milliseconds.
   * 'P1DT2H3M4.567S'
   *
   * @see https://www.iso.org/standard/70907.html
   * @param duration an ISO-formatted duration to be parsed.
   * @returns the parsed `Duration`.
   */
  public static parse(duration: string): Duration {
    const matches = duration.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)\.?(\d{1,3})?S)?)?$/);
    if (!matches) {
      throw new UnscopedValidationError(`Not a valid ISO duration: ${duration}`);
    }
    const [, days, hours, minutes, seconds, milliseconds] = matches;
    if (!days && !hours && !minutes && !seconds && !milliseconds) {
      throw new UnscopedValidationError(`Not a valid ISO duration: ${duration}`);
    }
    const millis = milliseconds ? milliseconds.padEnd(3, '0') : '';
    return Duration.millis(
      _toInt(millis)
      + _toInt(seconds) * TimeUnit.Seconds.inMillis
      + (_toInt(minutes) * TimeUnit.Minutes.inMillis)
      + (_toInt(hours) * TimeUnit.Hours.inMillis)
      + (_toInt(days) * TimeUnit.Days.inMillis),
    );

    function _toInt(str: string): number {
      if (!str) { return 0; }
      return Number(str);
    }
  }

  private readonly amount: number;
  private readonly unit: TimeUnit;

  private constructor(amount: number, unit: TimeUnit) {
    if (!Token.isUnresolved(amount) && amount < 0) {
      throw new UnscopedValidationError(`Duration amounts cannot be negative. Received: ${amount}`);
    }

    this.amount = amount;
    this.unit = unit;
  }

  /**
   * Add two Durations together
   */
  public plus(rhs: Duration): Duration {
    const targetUnit = finestUnit(this.unit, rhs.unit);
    const res = convert(this.amount, this.unit, targetUnit, {}) + convert(rhs.amount, rhs.unit, targetUnit, {});
    return new Duration(res, targetUnit);
  }

  /**
   * Substract two Durations together
   */
  public minus(rhs: Duration): Duration {
    const targetUnit = finestUnit(this.unit, rhs.unit);
    const res = convert(this.amount, this.unit, targetUnit, {}) - convert(rhs.amount, rhs.unit, targetUnit, {});
    return new Duration(res, targetUnit);
  }

  /**
   * Return the total number of milliseconds in this Duration
   *
   * @returns the value of this `Duration` expressed in Milliseconds.
   */
  public toMilliseconds(opts: TimeConversionOptions = {}): number {
    return convert(this.amount, this.unit, TimeUnit.Milliseconds, opts);
  }

  /**
   * Return the total number of seconds in this Duration
   *
   * @returns the value of this `Duration` expressed in Seconds.
   */
  public toSeconds(opts: TimeConversionOptions = {}): number {
    return convert(this.amount, this.unit, TimeUnit.Seconds, opts);
  }

  /**
   * Return the total number of minutes in this Duration
   *
   * @returns the value of this `Duration` expressed in Minutes.
   */
  public toMinutes(opts: TimeConversionOptions = {}): number {
    return convert(this.amount, this.unit, TimeUnit.Minutes, opts);
  }

  /**
   * Return the total number of hours in this Duration
   *
   * @returns the value of this `Duration` expressed in Hours.
   */
  public toHours(opts: TimeConversionOptions = {}): number {
    return convert(this.amount, this.unit, TimeUnit.Hours, opts);
  }

  /**
   * Return the total number of days in this Duration
   *
   * @returns the value of this `Duration` expressed in Days.
   */
  public toDays(opts: TimeConversionOptions = {}): number {
    return convert(this.amount, this.unit, TimeUnit.Days, opts);
  }

  /**
   * Return an ISO 8601 representation of this period
   *
   * @returns a string starting with 'P' describing the period
   * @see https://www.iso.org/standard/70907.html
   */
  public toIsoString(): string {
    if (this.amount === 0) { return 'PT0S'; }

    const ret = ['P'];
    let tee = false;

    for (const [amount, unit] of this.components(true)) {
      if ([TimeUnit.Seconds, TimeUnit.Minutes, TimeUnit.Hours].includes(unit) && !tee) {
        ret.push('T');
        tee = true;
      }
      ret.push(`${amount}${unit.isoLabel}`);
    }

    return ret.join('');
  }

  /**
   * Return an ISO 8601 representation of this period
   *
   * @returns a string starting with 'P' describing the period
   * @see https://www.iso.org/standard/70907.html
   * @deprecated Use `toIsoString()` instead.
   */
  public toISOString(): string {
    return this.toIsoString();
  }

  /**
   * Turn this duration into a human-readable string
   */
  public toHumanString(): string {
    if (this.amount === 0) { return fmtUnit(0, this.unit); }
    if (Token.isUnresolved(this.amount)) { return `<token> ${this.unit.label}`; }

    return this.components(false)
      // 2 significant parts, that's totally enough for humans
      .slice(0, 2)
      .map(([amount, unit]) => fmtUnit(amount, unit))
      .join(' ');

    function fmtUnit(amount: number, unit: TimeUnit) {
      if (amount === 1) {
        // All of the labels end in 's'
        return `${amount} ${unit.label.substring(0, unit.label.length - 1)}`;
      }
      return `${amount} ${unit.label}`;
    }
  }

  /**
   * Returns a string representation of this `Duration`
   *
   * This is is never the right function to use when you want to use the `Duration`
   * object in a template. Use `toSeconds()`, `toMinutes()`, `toDays()`, etc. instead.
   */
  public toString(): string {
    return `Duration.${this.unit.label}(${this.amount})`;
  }

  /**
   * Return the duration in a set of whole numbered time components, ordered from largest to smallest
   *
   * Only components != 0 will be returned.
   *
   * Can combine millis and seconds together for the benefit of toIsoString,
   * makes the logic in there simpler.
   */
  private components(combineMillisWithSeconds: boolean): Array<[number, TimeUnit]> {
    const ret = new Array<[number, TimeUnit]>();
    let millis = convert(this.amount, this.unit, TimeUnit.Milliseconds, { integral: false });

    for (const unit of [TimeUnit.Days, TimeUnit.Hours, TimeUnit.Minutes, TimeUnit.Seconds]) {
      const count = convert(millis, TimeUnit.Milliseconds, unit, { integral: false });
      // Round down to a whole number UNLESS we're combining millis and seconds and we got to the seconds
      const wholeCount = unit === TimeUnit.Seconds && combineMillisWithSeconds ? count : Math.floor(count);
      if (wholeCount > 0) {
        ret.push([wholeCount, unit]);
        millis -= wholeCount * unit.inMillis;
      }
    }

    // Remainder in millis (keep only above threshold)
    if (millis > 0.0001) {
      ret.push([millis, TimeUnit.Milliseconds]);
    }
    return ret;
  }

  /**
   * Checks if duration is a token or a resolvable object
   */
  public isUnresolved() {
    return Token.isUnresolved(this.amount);
  }

  /**
   * Returns unit of the duration
   */
  public unitLabel() {
    return this.unit.label;
  }

  /**
   * Returns stringified number of duration
   */
  public formatTokenToNumber(): string {
    const number = Tokenization.stringifyNumber(this.amount);
    return `${number} ${this.unit.label}`;
  }
}

/**
 * Options for how to convert time to a different unit.
 */
export interface TimeConversionOptions {
  /**
   * If `true`, conversions into a larger time unit (e.g. `Seconds` to `Minutes`) will fail if the result is not an
   * integer.
   *
   * @default true
   */
  readonly integral?: boolean;
}

class TimeUnit {
  public static readonly Milliseconds = new TimeUnit('millis', '', 1);
  public static readonly Seconds = new TimeUnit('seconds', 'S', 1_000);
  public static readonly Minutes = new TimeUnit('minutes', 'M', 60_000);
  public static readonly Hours = new TimeUnit('hours', 'H', 3_600_000);
  public static readonly Days = new TimeUnit('days', 'D', 86_400_000);

  private constructor(public readonly label: string, public readonly isoLabel: string, public readonly inMillis: number) {
    // MAX_SAFE_INTEGER is 2^53, so by representing our duration in millis (the lowest
    // common unit) the highest duration we can represent is
    // 2^53 / 86*10^6 ~= 104 * 10^6 days (about 100 million days).
  }

  public toString() {
    return this.label;
  }
}

function convert(amount: number, fromUnit: TimeUnit, toUnit: TimeUnit, { integral = true }: TimeConversionOptions) {
  if (fromUnit.inMillis === toUnit.inMillis) {
    if (integral && !Token.isUnresolved(amount) && !Number.isInteger(amount)) {
      throw new UnscopedValidationError(`${amount} must be a whole number of ${toUnit}.`);
    }
    return amount;
  }
  if (Token.isUnresolved(amount)) {
    throw new UnscopedValidationError(`Duration must be specified as 'Duration.${toUnit}()' here since its value comes from a token and cannot be converted (got Duration.${fromUnit})`);
  }
  const value = (amount * fromUnit.inMillis) / toUnit.inMillis;
  if (!Number.isInteger(value) && integral) {
    throw new UnscopedValidationError(`'${amount} ${fromUnit}' cannot be converted into a whole number of ${toUnit}.`);
  }
  return value;
}

/**
 * Return the time unit with highest granularity
 */
function finestUnit(a: TimeUnit, b: TimeUnit) {
  return a.inMillis < b.inMillis ? a : b;
}
