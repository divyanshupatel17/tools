import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('ai');

export default function Page() {
  return <CategoryPage id="ai" />;
}
