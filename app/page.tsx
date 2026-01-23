import { PageLayout } from "@/components/page-layout";

export default function Home() {
  return (
    <PageLayout>
      <div className="flex flex-col gap-16 items-center">
        <h1 className="text-3xl lg:text-4xl !leading-tight mx-auto max-w-xl text-center">
          Welcome
        </h1>
      </div>
    </PageLayout>
  );
}
