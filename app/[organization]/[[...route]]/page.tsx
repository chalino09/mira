import { redirect } from "next/navigation";

export default async function RoutedWorkspace({
  params
}: {
  params: Promise<{ organization: string; route?: string[] }>;
}) {
  const { organization, route } = await params;

  if (route?.length === 1 && route[0] === "nursery") {
    redirect(`/${encodeURIComponent(organization)}/vivero`);
  }

  return null;
}
