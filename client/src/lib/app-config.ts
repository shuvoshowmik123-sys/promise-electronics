// Desktop full-bleed hero prefers technician/workshop imagery with right-weighted subject room.
// Higher-res params for above-the-fold cover crop; CMS hero_images still override at runtime.
const heroImage = "https://images.unsplash.com/photo-1593642532400-2682810df593?auto=format&fit=crop&w=1600&q=80";
const repairImage = "https://images.unsplash.com/photo-1581092160562-40aa08e78837?auto=format&fit=crop&w=1800&q=80";
const tvImage = "https://images.unsplash.com/photo-1593784991095-a205069470b6?auto=format&fit=crop&w=1600&q=80";
const logoImage = "/logo.png";
const showroomImage = "https://images.unsplash.com/photo-1531829722641-0e2c9fa36036?auto=format&fit=crop&w=1600&q=80";

export const navItems = [
  { label: "Home", href: "/home" },
  { label: "Shop", href: "/shop" },
  { label: "Services", href: "/services" },
  { label: "Track Order", href: "/track-order" },
];

export const images = {
  hero: heroImage,
  repair: repairImage,
  tv: tvImage,
  logo: logoImage,
  showroom: showroomImage,
};
