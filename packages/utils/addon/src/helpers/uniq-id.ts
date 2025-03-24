export default function uid (
  prefix: string = "",
  suffix: string = ""
): string {
  let currentDateMilliseconds: number = new Date().getTime()

  const prefixTemplate = prefix ? `${prefix}-` : ""
  const suffixTemplate = suffix ? `-${suffix}` : ""
  const template: string = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"

  const replacedPattern = template.replace(/[xy]/g, function(currentChar) {
    const randomChar = (currentDateMilliseconds + Math.random() * 16) % 16 | 0
    currentDateMilliseconds = Math.floor(currentDateMilliseconds / 16)
    return (currentChar === "x" ? randomChar : (randomChar & 0x7) | 0x8).toString(16)
  })

  return `${prefixTemplate}${replacedPattern}${suffixTemplate}`
}
