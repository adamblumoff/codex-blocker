export const DEFAULT_DOMAINS = ["x.com", "youtube.com"];

export function normalizeDomain(input: string): string {
  let domain = input.toLowerCase().trim();
  domain = domain.replace(/^https?:\/\//, "");
  domain = domain.replace(/^www\./, "");
  domain = domain.replace(/\/.*$/, "");
  return domain;
}

export function isValidDomain(domain: string): boolean {
  const regex =
    /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,}$/;
  return regex.test(domain);
}
