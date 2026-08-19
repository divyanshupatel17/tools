import { ToolPage, toolMetadata, toolStaticParams } from '@/components/layout/tool_page';

type Params = Promise<{ tool_slug: string }>;

export const dynamicParams = false;

export function generateStaticParams() {
  return toolStaticParams();
}

export function generateMetadata({ params }: { params: Params }) {
  return toolMetadata(params);
}

export default function Page({ params }: { params: Params }) {
  return <ToolPage params={params} />;
}
