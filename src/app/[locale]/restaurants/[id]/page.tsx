import { RestaurantDetail } from "@/components/restaurants/restaurant-detail";

export default async function RestaurantPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <RestaurantDetail id={decodeURIComponent(id)} />
    </div>
  );
}
