import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('math');

export default function Page() {
  return <CategoryPage id="math" />;
}
