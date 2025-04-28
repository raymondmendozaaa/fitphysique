import About from '@/components/About.jsx';
import Hero from '@/components/Hero.jsx';
import Classes from '@/components/Classes.jsx';
import Team from '@/components/Team.jsx';
import Membership from '@/components/Membership.jsx';
import Testimonial from '@/components/Testimonial.jsx';
import Blog from '@/components/Blog.jsx';
import Brands from '@/components/Brands.jsx';

export const dynamic = "force-dynamic";

export default function Home() {
  return (
    <main>
      <Hero />
      <About />
      <Classes />
      <Team />
      <Membership />
      <Testimonial />
      <Blog />
      <Brands />
      {/* temporary div */}
      {/* <div className='h-[3000px]'></div> */}
    </main>
  );
}
