import { SavedPlanView } from "@/components/planner/planner-view";

export default async function SavedPlanPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SavedPlanView id={decodeURIComponent(id)} />
    </div>
  );
}
