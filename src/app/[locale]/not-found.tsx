import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-lg px-4 py-24 text-center">
      <p className="text-5xl font-bold text-brand-700">404</p>
      <p className="mt-4 text-slate-600">الصفحة غير موجودة · Page not found</p>
      <Link href="/" className="mt-6 inline-block rounded-lg bg-brand-700 px-5 py-2.5 text-sm font-semibold text-white">الرئيسية · Home</Link>
    </div>
  );
}
