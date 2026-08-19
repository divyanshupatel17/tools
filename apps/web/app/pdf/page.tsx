import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('pdf');

export default function Page() {
  return <CategoryPage id="pdf" />;
}
