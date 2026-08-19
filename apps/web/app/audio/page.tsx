import { CategoryPage, categoryMetadata } from '@/components/layout/category_page';

export const metadata = categoryMetadata('audio');

export default function Page() {
  return <CategoryPage id="audio" />;
}
