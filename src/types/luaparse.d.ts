import 'luaparse/lib/ast'

declare module 'luaparse/lib/ast' {
  // Set on every node when parsing with `ranges: true`; not declared by
  // @types/luaparse.
  interface Base<TType extends string> {
    type: TType
    range?: [number, number]
  }
}
