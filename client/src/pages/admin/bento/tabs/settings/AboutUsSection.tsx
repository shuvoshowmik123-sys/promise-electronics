import { useState } from "react";
import {
    Building2, Target, Lightbulb, Users, MapPin, Mail, Clock,
    Plus, Trash2, ArrowUp, ArrowDown, User, Image as ImageIcon
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { BentoCard } from "../../shared";
import { TagListCard } from "./TagListCard";

export interface TeamMember {
    id: number;
    name: string;
    role: string;
    photoUrl: string;
}

interface AboutUsSectionProps {
    aboutTitle: string; setAboutTitle: (v: string) => void;
    aboutDescription: string; setAboutDescription: (v: string) => void;
    aboutMission: string; setAboutMission: (v: string) => void;
    aboutVision: string; setAboutVision: (v: string) => void;
    aboutCapabilities: string[]; setAboutCapabilities: (v: string[]) => void;
    aboutTeam: string; setAboutTeam: (v: string) => void;
    aboutAddress: string; setAboutAddress: (v: string) => void;
    aboutEmail: string; setAboutEmail: (v: string) => void;
    aboutWorkingHours: string; setAboutWorkingHours: (v: string) => void;
    teamMembers: TeamMember[]; setTeamMembers: (v: TeamMember[]) => void;
}

export default function AboutUsSection({
    aboutTitle, setAboutTitle,
    aboutDescription, setAboutDescription,
    aboutMission, setAboutMission,
    aboutVision, setAboutVision,
    aboutCapabilities, setAboutCapabilities,
    aboutTeam, setAboutTeam,
    aboutAddress, setAboutAddress,
    aboutEmail, setAboutEmail,
    aboutWorkingHours, setAboutWorkingHours,
    teamMembers, setTeamMembers
}: AboutUsSectionProps) {

    // New team member state
    const [newMember, setNewMember] = useState<Omit<TeamMember, "id">>({ name: "", role: "", photoUrl: "" });

    const handleAddMember = () => {
        if (newMember.name && newMember.role) {
            setTeamMembers([...teamMembers, { ...newMember, id: Date.now() }]);
            setNewMember({ name: "", role: "", photoUrl: "" });
        }
    };

    const handleDeleteMember = (id: number) => {
        setTeamMembers(teamMembers.filter(m => m.id !== id));
    };

    const moveMember = (index: number, direction: "up" | "down") => {
        if (
            (direction === "up" && index === 0) ||
            (direction === "down" && index === teamMembers.length - 1)
        ) return;

        const newTeam = [...teamMembers];
        const targetIndex = direction === "up" ? index - 1 : index + 1;
        [newTeam[index], newTeam[targetIndex]] = [newTeam[targetIndex], newTeam[index]];
        setTeamMembers(newTeam);
    };

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pb-20">
            {/* 1. Page Header */}
            <BentoCard title="About Page Header" icon={<Building2 className="w-5 h-5 text-blue-500" />} variant="glass" className="md:col-span-1">
                <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Page Title</Label>
                        <Input
                            value={aboutTitle}
                            onChange={(e) => setAboutTitle(e.target.value)}
                            placeholder="Your Trusted Electronics Partner"
                            className="bg-white/50"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Company Description</Label>
                        <Textarea
                            value={aboutDescription}
                            onChange={(e) => setAboutDescription(e.target.value)}
                            placeholder="Tell visitors about your company..."
                            className="bg-white/50 min-h-[100px]"
                        />
                    </div>
                </div>
            </BentoCard>

            {/* 2. Mission & Vision */}
            <BentoCard title="Mission & Vision" icon={<Target className="w-5 h-5 text-purple-500" />} variant="glass" className="md:col-span-1">
                <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Mission Statement</Label>
                        <Textarea
                            value={aboutMission}
                            onChange={(e) => setAboutMission(e.target.value)}
                            placeholder="Our mission is to..."
                            className="bg-white/50 min-h-[80px]"
                        />
                    </div>
                    <div className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">Vision Statement</Label>
                        <Textarea
                            value={aboutVision}
                            onChange={(e) => setAboutVision(e.target.value)}
                            placeholder="Our vision is to..."
                            className="bg-white/50 min-h-[80px]"
                        />
                    </div>
                </div>
            </BentoCard>

            {/* 3. Capabilities */}
            <div className="md:col-span-2">
                <TagListCard
                    title="Our Capabilities"
                    icon={<Lightbulb className="w-5 h-5 text-amber-500" />}
                    items={aboutCapabilities}
                    setItems={setAboutCapabilities}
                    placeholder="Add capability (e.g. 'Certified Technicians')"
                    accentColor="amber"
                />
            </div>

            {/* 4. Team Description */}
            <BentoCard title="Team Overview" icon={<Users className="w-5 h-5 text-indigo-500" />} variant="glass">
                <div className="space-y-4 pt-2">
                    <Label className="text-xs text-muted-foreground">Team Bio</Label>
                    <Textarea
                        value={aboutTeam}
                        onChange={(e) => setAboutTeam(e.target.value)}
                        placeholder="Describe your team..."
                        className="bg-white/50 min-h-[120px]"
                    />
                </div>
            </BentoCard>

            {/* 5. Contact Details (About Page) */}
            <BentoCard title="Contact Details" icon={<MapPin className="w-5 h-5 text-emerald-500" />} variant="glass">
                <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-3">
                        <MapPin className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                            value={aboutAddress}
                            onChange={(e) => setAboutAddress(e.target.value)}
                            placeholder="Business Address"
                            className="bg-white/50"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Mail className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                            value={aboutEmail}
                            onChange={(e) => setAboutEmail(e.target.value)}
                            placeholder="Email Address"
                            className="bg-white/50"
                        />
                    </div>
                    <div className="flex items-center gap-3">
                        <Clock className="w-4 h-4 text-muted-foreground shrink-0" />
                        <Input
                            value={aboutWorkingHours}
                            onChange={(e) => setAboutWorkingHours(e.target.value)}
                            placeholder="Working Hours"
                            className="bg-white/50"
                        />
                    </div>
                </div>
            </BentoCard>

            {/* 6. Team Members */}
            <BentoCard title="Meet the Team" icon={<Users className="w-5 h-5 text-pink-500" />} variant="glass" className="md:col-span-2">
                <div className="space-y-6 pt-2">
                    {/* Add New Member */}
                    <div className="p-4 bg-slate-50/50 rounded-xl border border-slate-200/60 space-y-4">
                        <h4 className="text-sm font-medium text-slate-700">Add New Team Member</h4>
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                            <div className="space-y-1.5 md:col-span-1">
                                <Label className="text-xs">Name</Label>
                                <Input
                                    value={newMember.name}
                                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                                    placeholder="e.g. John Doe"
                                    className="bg-white"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-1">
                                <Label className="text-xs">Role</Label>
                                <Input
                                    value={newMember.role}
                                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                                    placeholder="e.g. Senior Technician"
                                    className="bg-white"
                                />
                            </div>
                            <div className="space-y-1.5 md:col-span-1">
                                <Label className="text-xs">Photo URL</Label>
                                <Input
                                    value={newMember.photoUrl}
                                    onChange={(e) => setNewMember({ ...newMember, photoUrl: e.target.value })}
                                    placeholder="https://..."
                                    className="bg-white"
                                />
                            </div>
                            <div className="flex items-end md:col-span-1">
                                <Button onClick={handleAddMember} disabled={!newMember.name || !newMember.role} className="w-full">
                                    <Plus className="w-4 h-4 mr-2" /> Add Member
                                </Button>
                            </div>
                        </div>
                        {newMember.photoUrl && (
                            <div className="flex items-center gap-3">
                                <div className="w-10 h-10 rounded-full bg-slate-100 overflow-hidden border border-slate-200">
                                    <img src={newMember.photoUrl} alt="Preview" className="w-full h-full object-cover" onError={(e) => (e.target as HTMLImageElement).src = ""} />
                                </div>
                                <span className="text-xs text-muted-foreground">Preview</span>
                            </div>
                        )}
                    </div>

                    {/* Members List */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {teamMembers.map((member, idx) => (
                            <div key={member.id} className="group relative flex items-start gap-4 p-4 rounded-xl border border-slate-100 bg-white/40 hover:bg-white/60 hover:shadow-sm transition-all duration-200">
                                <div className="w-14 h-14 rounded-full bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                                    {member.photoUrl ? (
                                        <img src={member.photoUrl} alt={member.name} className="w-full h-full object-cover" />
                                    ) : (
                                        <div className="w-full h-full flex items-center justify-center text-slate-300">
                                            <User className="w-6 h-6" />
                                        </div>
                                    )}
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                    <h3 className="font-medium text-slate-900 truncate">{member.name}</h3>
                                    <p className="text-xs text-slate-500 truncate">{member.role}</p>
                                </div>

                                {/* Actions */}
                                <div className="flex flex-col gap-1 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                                    <div className="flex gap-1">
                                        <Button
                                            size="icon" variant="ghost" className="h-6 w-6"
                                            onClick={() => moveMember(idx, "up")} disabled={idx === 0}
                                        >
                                            <ArrowUp className="w-3 h-3" />
                                        </Button>
                                        <Button
                                            size="icon" variant="ghost" className="h-6 w-6"
                                            onClick={() => moveMember(idx, "down")} disabled={idx === teamMembers.length - 1}
                                        >
                                            <ArrowDown className="w-3 h-3" />
                                        </Button>
                                    </div>
                                    <Button
                                        size="icon" variant="ghost" className="h-6 w-6 text-red-500 hover:text-red-600 hover:bg-red-50 ml-auto"
                                        onClick={() => handleDeleteMember(member.id)}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                        {teamMembers.length === 0 && (
                            <div className="col-span-full py-8 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                                <p className="text-sm text-slate-500">No team members added yet.</p>
                            </div>
                        )}
                    </div>
                </div>
            </BentoCard>
        </div>
    );
}
