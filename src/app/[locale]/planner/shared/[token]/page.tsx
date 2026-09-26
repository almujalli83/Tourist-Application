import { SharedPlanView } from "@/components/planner/planner-view";

export default async function SharedPlanPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <SharedPlanView token={decodeURIComponent(token)} />
    </div>
  );
}
