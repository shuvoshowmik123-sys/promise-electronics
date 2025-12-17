import { PublicLayout } from "@/components/layout/PublicLayout";
import { Card, CardContent } from "@/components/ui/card";
import { useQuery } from "@tanstack/react-query";
import { settingsApi } from "@/lib/api";
import { Tv, Wrench, Users, Award, MapPin, Phone, Mail, Clock } from "lucide-react";
import { images } from "@/lib/mock-data";
import { usePageTitle } from "@/hooks/usePageTitle";
import { motion } from "framer-motion";

export default function AboutPage() {
  usePageTitle("About Us");
  const { data: settings = [] } = useQuery({
    queryKey: ["settings"],
    queryFn: settingsApi.getAll,
  });

  const getSetting = (key: string, defaultValue: string): string => {
    const setting = settings.find((s) => s.key === key);
    return setting?.value || defaultValue;
  };

  const getSettingArray = (key: string, defaultValue: string[]): string[] => {
    const setting = settings.find((s) => s.key === key);
    if (setting?.value) {
      try {
        return JSON.parse(setting.value);
      } catch {
        return defaultValue;
      }
    }
    return defaultValue;
  };

  const siteName = getSetting("site_name", "Promise Electronics");
  const supportPhone = getSetting("support_phone", "+880 1700-000000");
  const logoUrl = getSetting("logo_url", "");
  const aboutTitle = getSetting("about_title", "Your Trusted Electronics Partner in Bangladesh");
  const aboutDescription = getSetting("about_description", "Promise Electronics has been serving Bangladesh since 2010, providing expert TV repair services and genuine electronic parts. We are committed to delivering quality service with transparency and trust.");
  const aboutMission = getSetting("about_mission", "To provide affordable, reliable, and expert electronics repair services while offering genuine spare parts to every household in Bangladesh.");
  const aboutVision = getSetting("about_vision", "To become the most trusted electronics service provider in Bangladesh, known for quality, integrity, and customer satisfaction.");
  const capabilities = getSettingArray("about_capabilities", [
    "Expert TV Repair for all major brands",
    "Genuine spare parts and accessories",
    "Home service across Dhaka",
    "Corporate maintenance contracts",
    "24/7 customer support",
    "90-day service warranty"
  ]);
  const teamDescription = getSetting("about_team", "Our team consists of certified technicians with over 10 years of experience in electronics repair. Each technician undergoes rigorous training to stay updated with the latest technologies.");
  const address = getSetting("about_address", "House 123, Road 45, Gulshan-2, Dhaka 1212, Bangladesh");
  const email = getSetting("about_email", "support@promise-electronics.com");
  const workingHours = getSetting("about_working_hours", "Saturday - Thursday: 9:00 AM - 8:00 PM");

  return (
    <PublicLayout>
      <div className="min-h-screen bg-gradient-to-b from-slate-100 via-slate-50 to-slate-100">
        {/* Neumorphic Hero Section */}
        <section className="relative py-24 overflow-hidden bg-gradient-to-br from-slate-100 via-slate-200 to-slate-100">
          {/* Subtle Background Orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div className="absolute -top-32 -left-32 w-96 h-96 bg-primary/5 rounded-full blur-3xl"></div>
            <div className="absolute -bottom-32 -right-32 w-96 h-96 bg-teal-500/5 rounded-full blur-3xl"></div>
          </div>
          
          {/* Subtle Logo Pattern */}
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] opacity-[0.03]">
              <img src={logoUrl || images.logo} alt="" className="w-full h-full object-contain" />
            </div>
          </div>
          
          {/* Neumorphic Card Container */}
          <div className="container mx-auto px-4 relative z-10">
            <motion.div 
              className="max-w-3xl mx-auto"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
            >
              {/* Neumorphic Card */}
              <div className="bg-slate-100 rounded-2xl md:rounded-3xl shadow-neumorph-lg p-5 md:p-12">
                <div className="flex flex-col items-center text-center">
                  {/* Logo in Neumorphic Circle */}
                  <div className="w-20 h-20 md:w-28 md:h-28 bg-slate-100 shadow-neumorph rounded-full flex items-center justify-center p-3 md:p-4 mb-4 md:mb-8">
                    <img src={logoUrl || images.logo} alt="Promise Electronics Logo" className="w-full h-full object-contain" />
                  </div>
                  
                  <h1 className="text-2xl md:text-5xl font-bold mb-3 md:mb-4 text-slate-800" data-testid="text-about-title">
                    About {siteName}
                  </h1>
                  <p className="text-xl text-muted-foreground max-w-2xl" data-testid="text-about-subtitle">
                    {aboutTitle}
                  </p>
                  
                  {/* Decorative Line */}
                  <div className="mt-8 w-24 h-1 bg-gradient-to-r from-primary to-teal-500 rounded-full shadow-neumorph-sm"></div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* About Description - Neumorphic */}
        <motion.section 
          className="py-12"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl">
                <CardContent className="p-4 md:p-8">
                  <h2 className="text-xl md:text-2xl font-bold mb-3 md:mb-4 text-primary">Who We Are</h2>
                  <p className="text-lg text-muted-foreground leading-relaxed" data-testid="text-about-description">
                    {aboutDescription}
                  </p>
                </CardContent>
              </Card>
            </div>
          </div>
        </motion.section>

        {/* Mission & Vision - Neumorphic */}
        <section className="py-12 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50">
          <div className="container mx-auto px-4">
            <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl h-full">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl flex items-center justify-center">
                        <Award className="w-5 h-5 md:w-6 md:h-6 text-primary" />
                      </div>
                      <h3 className="text-lg md:text-xl font-bold">Our Mission</h3>
                    </div>
                    <p className="text-muted-foreground" data-testid="text-about-mission">
                      {aboutMission}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, margin: "-100px" }}
                transition={{ duration: 0.5, delay: 0.1 }}
              >
                <Card className="bg-slate-100 shadow-neumorph border-none rounded-2xl h-full">
                  <CardContent className="p-4 md:p-6">
                    <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                      <div className="w-10 h-10 md:w-12 md:h-12 bg-white shadow-neumorph-inset rounded-lg md:rounded-xl flex items-center justify-center">
                        <Tv className="w-5 h-5 md:w-6 md:h-6 text-teal-500" />
                      </div>
                      <h3 className="text-lg md:text-xl font-bold">Our Vision</h3>
                    </div>
                    <p className="text-muted-foreground" data-testid="text-about-vision">
                      {aboutVision}
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Capabilities - Neumorphic */}
        <motion.section 
          className="py-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-8">What We Offer</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {capabilities.map((capability, index) => (
                  <motion.div
                    key={index}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.05 }}
                  >
                    <Card className="bg-slate-100 shadow-neumorph border-none rounded-xl hover:shadow-neumorph-lg transition-shadow">
                      <CardContent className="p-4 flex items-center gap-3">
                        <div className="w-10 h-10 bg-white shadow-neumorph-inset rounded-lg flex items-center justify-center flex-shrink-0">
                          <Wrench className="w-5 h-5 text-green-600" />
                        </div>
                        <span className="text-sm font-medium" data-testid={`text-capability-${index}`}>
                          {capability}
                        </span>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>

        {/* Team Section - Neumorphic */}
        <motion.section 
          className="py-12 bg-gradient-to-br from-slate-50 via-slate-100 to-slate-50"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto text-center">
              <div className="w-16 h-16 bg-slate-100 shadow-neumorph rounded-full flex items-center justify-center mx-auto mb-4">
                <Users className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-3xl font-bold mb-4">Our Expert Team</h2>
              <p className="text-lg text-muted-foreground max-w-2xl mx-auto" data-testid="text-about-team">
                {teamDescription}
              </p>
            </div>
          </div>
        </motion.section>

        {/* Contact Info - Neumorphic */}
        <motion.section 
          className="py-12"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.5 }}
        >
          <div className="container mx-auto px-4">
            <div className="max-w-4xl mx-auto">
              <h2 className="text-3xl font-bold text-center mb-8">Contact Us</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  { icon: MapPin, title: "Address", value: address, testId: "text-about-address" },
                  { icon: Phone, title: "Phone", value: supportPhone, testId: "text-about-phone" },
                  { icon: Mail, title: "Email", value: email, testId: "text-about-email" },
                  { icon: Clock, title: "Working Hours", value: workingHours, testId: "text-about-hours" }
                ].map((item, index) => (
                  <motion.div
                    key={item.title}
                    initial={{ opacity: 0, y: 15 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <Card className="text-center bg-slate-100 shadow-neumorph border-none rounded-2xl hover:shadow-neumorph-lg transition-shadow">
                      <CardContent className="p-6">
                        <div className="w-14 h-14 bg-white shadow-neumorph-inset rounded-xl flex items-center justify-center mx-auto mb-3">
                          <item.icon className="w-7 h-7 text-primary" />
                        </div>
                        <h4 className="font-semibold mb-2">{item.title}</h4>
                        <p className="text-sm text-muted-foreground" data-testid={item.testId}>
                          {item.value}
                        </p>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </div>
        </motion.section>
      </div>
    </PublicLayout>
  );
}
