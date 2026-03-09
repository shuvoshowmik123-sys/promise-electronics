import { recommendTechnicians, TechnicianMatch } from "../client/src/lib/technician-matching";

// Mock Data
const mockJobs = [
    {
        id: "job1",
        device: "Samsung LED TV 55inch",
        issue: "Backlight failure",
        reportedDefect: "Screen went black, sound is okay",
        problemFound: null,
        status: "Pending",
        priority: "High"
    },
    {
        id: "job2",
        device: "Sony Bravia 4K",
        issue: "Mainboard issue",
        reportedDefect: "No power, blinking red light",
        problemFound: null,
        status: "Pending",
        priority: "Normal"
    }
];

const mockTechnicians = [
    {
        id: "tech1",
        name: "John Doe",
        skills: "LED TV,Backlight,Panel Repair",
        role: "Technician",
        activeJobs: 2,
        completedToday: 1,
        performanceScore: 4.8,
        seniorityLevel: "Senior"
    },
    {
        id: "tech2",
        name: "Jane Smith",
        skills: "Mainboard,Chip Level,Sony",
        role: "Technician",
        activeJobs: 5,
        completedToday: 0,
        performanceScore: 4.2,
        seniorityLevel: "Mid"
    },
    {
        id: "tech3",
        name: "Bob Junior",
        skills: "Basic Repairs",
        role: "Technician",
        activeJobs: 0,
        completedToday: 0,
        performanceScore: 3.5,
        seniorityLevel: "Junior"
    }
];

console.log("Running Matching Logic Verification...");

const recommendations = recommendTechnicians(mockJobs, mockTechnicians);

console.log("Recommendations:", JSON.stringify(recommendations, null, 2));

// Verify Output Logic
const topTech = recommendations[0];
if (topTech.name === "John Doe") {
    console.log("✅ Correctly identified John Doe as best match for Backlight issue (high skill + low workload)");
} else {
    console.error("❌ Failed to identify optimal technician. Got:", topTech.name);
}

const busyTech = recommendations.find(t => t.name === "Jane Smith");
if (busyTech && busyTech.score < topTech.score) {
    console.log("✅ Jane Smith ranked lower due to workload or skill match.");
}

console.log("Verification Complete.");
