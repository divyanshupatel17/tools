import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('converters');

export default function Page() {
  return <CategoryPage id="converters" />;
}
