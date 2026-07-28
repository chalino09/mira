export type OrganizationRouteMembership = {
  organization: {
    name: string;
    slug?: string;
  };
};

export type OrganizationSlugResolution<T extends OrganizationRouteMembership> =
  | { kind: "no-request" }
  | { kind: "matched"; membership: T; canonicalSlug: string }
  | { kind: "canonical"; membership: T; canonicalSlug: string }
  | { kind: "denied" };

export function organizationRouteSlug(name: string) {
  const normalized = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return normalized || "empresa";
}

export function resolveOrganizationSlug<T extends OrganizationRouteMembership>(
  memberships: T[],
  requestedSlug?: string
): OrganizationSlugResolution<T> {
  if (!requestedSlug) return { kind: "no-request" };

  const normalizedRequestedSlug = organizationRouteSlug(requestedSlug);
  const membership = memberships.find((item) => {
    const organizationName = item.organization.slug ?? item.organization.name;
    return organizationRouteSlug(organizationName) === normalizedRequestedSlug;
  });

  if (!membership) return { kind: "denied" };

  const canonicalSlug = organizationRouteSlug(membership.organization.slug ?? membership.organization.name);
  return requestedSlug === canonicalSlug
    ? { kind: "matched", membership, canonicalSlug }
    : { kind: "canonical", membership, canonicalSlug };
}

export function canonicalOrganizationPath(pathname: string, canonicalSlug: string) {
  const segments = pathname.split("/").filter(Boolean);
  const routeSegments = segments.slice(1);
  return `/${encodeURIComponent(canonicalSlug)}${routeSegments.length ? `/${routeSegments.join("/")}` : ""}`;
}

export function canonicalOrganizationUrl(pathname: string, canonicalSlug: string, query?: string) {
  const canonicalPath = canonicalOrganizationPath(pathname, canonicalSlug);
  return `${canonicalPath}${query ? `?${query}` : ""}`;
}
