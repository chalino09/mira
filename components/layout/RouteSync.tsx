"use client";

import { useEffect, useMemo, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { allowsAllGreenhouses, appRoute, organizationRouteSlug, parseAppRoute, supportsGreenhouse, supportsPeriod } from "@/lib/routes";
import { useGreenhouseStore } from "@/lib/store";

export function RouteSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = useGreenhouseStore((state) => state.activeSection);
  const selectedGreenhouseId = useGreenhouseStore((state) => state.selectedGreenhouseId);
  const selectedPeriod = useGreenhouseStore((state) => state.selectedPeriod);
  const organization = useGreenhouseStore((state) => state.organization);
  const greenhouses = useGreenhouseStore((state) => state.greenhouses);
  const setActiveSection = useGreenhouseStore((state) => state.setActiveSection);
  const setSelectedGreenhouseId = useGreenhouseStore((state) => state.setSelectedGreenhouseId);
  const setSelectedPeriod = useGreenhouseStore((state) => state.setSelectedPeriod);
  const handledLocation = useRef<string | null>(null);
  const query = searchParams.toString();
  const route = useMemo(
    () => parseAppRoute(pathname, new URLSearchParams(query)),
    [pathname, query]
  );

  useEffect(() => {
    if (!organization.id) return;

    const location = `${pathname}${query ? `?${query}` : ""}`;
    const organizationRouteName = organization.slug ?? organization.name;
    const canonicalOrganization = organizationRouteSlug(organizationRouteName);
    const targetsAnotherOrganization = Boolean(route.organizationSlug && route.organizationSlug !== canonicalOrganization);
    const isNewLocation = handledLocation.current !== location;

    if (targetsAnotherOrganization) return;

    if (isNewLocation) {
      if (route.entity) {
        if (activeSection !== route.section) {
          setActiveSection(route.section);
          return;
        }
        handledLocation.current = location;
        return;
      }
      const needsCanonicalPath = route.organizationSlug !== canonicalOrganization
        || !route.isKnown
        || (route.section === "calendar" && !route.weekStart);

      if (needsCanonicalPath) {
        handledLocation.current = location;
        router.replace(appRoute(organizationRouteName, {
          section: route.isKnown ? route.section : "overview",
          greenhouseId: selectedGreenhouseId,
          period: selectedPeriod,
          weekStart: route.weekStart,
          list: route.list
        }));
        return;
      }

      if (activeSection !== route.section) {
        setActiveSection(route.section);
        return;
      }

      const routeGreenhouseIsVisible = route.greenhouseId === "__all__"
        ? allowsAllGreenhouses(route.section)
        : greenhouses.some((greenhouse) => greenhouse.id === route.greenhouseId);
      if (supportsGreenhouse(route.section) && route.greenhouseId && routeGreenhouseIsVisible && route.greenhouseId !== selectedGreenhouseId) {
        setSelectedGreenhouseId(route.greenhouseId);
        return;
      }
      if (supportsPeriod(route.section) && route.period && route.period !== selectedPeriod) {
        setSelectedPeriod(route.period);
        return;
      }

      if (
        (supportsGreenhouse(route.section) && (!route.greenhouseId || !routeGreenhouseIsVisible))
        || (supportsPeriod(route.section) && !route.period)
      ) {
        handledLocation.current = location;
        router.replace(appRoute(organizationRouteName, {
          section: activeSection,
          greenhouseId: selectedGreenhouseId,
          period: selectedPeriod,
          weekStart: route.weekStart,
          list: route.list
        }));
        return;
      }
      handledLocation.current = location;
      return;
    }

    if (route.entity) return;

    const canonicalPath = appRoute(organizationRouteName, {
      section: activeSection,
      greenhouseId: selectedGreenhouseId,
      period: selectedPeriod,
      weekStart: route.weekStart,
      list: route.list
    });
    if (location !== canonicalPath) router.push(canonicalPath);
  }, [
    activeSection,
    greenhouses,
    organization.id,
    organization.name,
    organization.slug,
    pathname,
    query,
    route,
    router,
    selectedGreenhouseId,
    selectedPeriod,
    setActiveSection,
    setSelectedGreenhouseId,
    setSelectedPeriod
  ]);

  return null;
}
