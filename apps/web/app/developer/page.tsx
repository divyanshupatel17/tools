import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('developer');

export default function Page() {
  return <CategoryPage id="developer" />;
}
