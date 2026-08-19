import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('utilities');

export default function Page() {
  return <CategoryPage id="utilities" />;
}
