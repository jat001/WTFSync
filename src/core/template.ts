const PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g

/**
 * Replace `{{NAME}}` placeholders in an addon template. Every placeholder
 * must have a value, so a template change can never ship a literal
 * `{{NAME}}` to the game.
 */
export function fillTemplate(
  template: string,
  values: Readonly<Record<string, string>>,
): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = values[name]
    if (value === undefined) throw new Error(`no value for template ${match}`)
    return value
  })
}
