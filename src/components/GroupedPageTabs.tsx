import { ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export type PageTab = { value: string; label: string; content: ReactNode };

export default function GroupedPageTabs({ title, tabs }: { title: string; tabs: PageTab[] }) {
  const [params, setParams] = useSearchParams();
  const requested = params.get("tab");
  const active = tabs.find((tab) => tab.value === requested) ?? tabs[0];
  if (!active) return null;
  return (
    <div className="min-w-0">
      <div className="px-4 pt-6 sm:px-6">
        <h1 className="text-2xl font-semibold mb-4">{title}</h1>
      </div>
      <Tabs value={active.value} onValueChange={(tab) => setParams({ tab })}>
        <div className="px-4 sm:px-6 overflow-x-auto">
          <TabsList className="h-auto min-h-10 w-max">
            {tabs.map((tab) => <TabsTrigger key={tab.value} value={tab.value}>{tab.label}</TabsTrigger>)}
          </TabsList>
        </div>
        <TabsContent key={active.value} value={active.value} className="mt-0">{active.content}</TabsContent>
      </Tabs>
    </div>
  );
}