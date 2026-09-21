declare module "bun:test" {
  export interface Matchers {
    not: Matchers
    toBe(expected: unknown): void
    toEqual(expected: unknown): void
    toBeNull(): void
    toBeDefined(): void
    toBeUndefined(): void
    toBeTruthy(): void
    toBeFalsy(): void
    toMatch(pattern: string | RegExp): void
    toContain(expected: unknown): void
    toBeGreaterThan(expected: number): void
    toBeGreaterThanOrEqual(expected: number): void
    toBeLessThan(expected: number): void
    toBeLessThanOrEqual(expected: number): void
    toHaveLength(length: number): void
    toBeInstanceOf(ctor: unknown): void
    toThrow(expected?: unknown): void
    unreachable(message?: string): never
  }

  export interface ExpectStatic {
    (value: unknown, message?: string): Matchers
    unreachable(message?: string): never
  }

  export const expect: ExpectStatic

  export function describe(name: string, fn: () => void): void
  export function describe(name: string, fn: (ctx: SuiteContext) => void): void
  export function test(name: string, fn: () => void | Promise<void>, timeout?: number): void
  export function test(name: string, fn: (ctx: TestContext) => void | Promise<void>, timeout?: number): void
  export namespace test {
    function skipIf(condition: boolean): (name: string, fn: () => void | Promise<void>) => void
    function runIf(condition: boolean): (name: string, fn: () => void | Promise<void>) => void
    function skip(name?: string): void
  }
  export function beforeAll(fn: () => void | Promise<void>): void
  export function afterAll(fn: () => void | Promise<void>): void
  export function beforeEach(fn: () => void | Promise<void>): void
  export function afterEach(fn: () => void | Promise<void>): void

  export interface SuiteContext {}
  export interface TestContext {
    skip(): void
  }
}
