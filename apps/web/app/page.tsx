import { CategoriesSection } from '@/components/landing/categories_section';
import { Hero } from '@/components/landing/hero';
import { PopularTools } from '@/components/landing/popular_tools';
import { Statistics } from '@/components/landing/statistics';

export default function HomePage() {
  return (
    <>
      <Hero />
      <PopularTools />
      <CategoriesSection />
      <Statistics />
    </>
  );
}
