export function alphabeticalPriceBook<T extends { description: string; id: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.description.localeCompare(b.description, 'en-GB', { sensitivity: 'base', numeric: true }) || a.id.localeCompare(b.id));
}