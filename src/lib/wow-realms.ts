export function shortRealmName(name: string): string {
  return /^(时光(?:[IVX]+|[Ⅰ-Ⅻ]|\d+))/.exec(name)?.[1].normalize('NFKC') ?? name
}
