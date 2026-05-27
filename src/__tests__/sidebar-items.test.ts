/**
 * Sidebar Navigation Items Test
 * 
 * Verifies the sidebar navigation structure follows the approved simplification:
 * - Primary nav only: Memories, Insights, Projects, Agents, Decisions, Settings
 * - No Crew label (renamed to Agents)
 * - No external /memory link in primary dashboard nav
 * - Secondary actions (evidence, graph, audit, health, skills, memory-explorer, builder) only as subItems
 */

import { describe, expect, it } from "vitest";
import { sidebarItems } from "@/navigation/sidebar/sidebar-items";

describe("sidebarItems", () => {
  describe("primary navigation structure", () => {
    it("should have exactly 6 primary navigation items in the Primary group", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      expect(primaryGroup).toBeDefined();
      expect(primaryGroup?.items.length).toBe(6);
    });

    it("should contain Memories as first primary nav item", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const memoriesItem = primaryGroup?.items.find((i) => i.title === "Memories");
      expect(memoriesItem).toBeDefined();
      expect(memoriesItem?.url).toBe("/dashboard/feed");
    });

    it("should contain Insights as second primary nav item", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const insightsItem = primaryGroup?.items.find((i) => i.title === "Insights");
      expect(insightsItem).toBeDefined();
      expect(insightsItem?.url).toBe("/dashboard/insights");
    });

    it("should contain Projects as third primary nav item", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const projectsItem = primaryGroup?.items.find((i) => i.title === "Projects");
      expect(projectsItem).toBeDefined();
      expect(projectsItem?.url).toBe("/dashboard/projects");
    });

    it("should contain Agents as fourth primary nav item", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const agentsItem = primaryGroup?.items.find((i) => i.title === "Agents");
      expect(agentsItem).toBeDefined();
      expect(agentsItem?.url).toBe("/dashboard/agents");
      expect(agentsItem?.title).not.toBe("Crew");
    });

    it("should contain Decisions as fifth primary nav item with subItems", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const decisionsItem = primaryGroup?.items.find((i) => i.title === "Decisions");
      expect(decisionsItem).toBeDefined();
      expect(decisionsItem?.url).toBe("/dashboard/decisions");
      expect(decisionsItem?.subItems).toBeDefined();
      expect(decisionsItem?.subItems?.length).toBe(2);
    });

    it("should contain Settings as sixth primary nav item with subItems", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const settingsItem = primaryGroup?.items.find((i) => i.title === "Settings");
      expect(settingsItem).toBeDefined();
      expect(settingsItem?.url).toBe("/dashboard/settings");
      expect(settingsItem?.subItems).toBeDefined();
      expect(settingsItem?.subItems?.length).toBe(2);
    });

    it("should not contain Crew as any primary nav item", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const crewItem = primaryGroup?.items.find((i) => i.title === "Crew");
      expect(crewItem).toBeUndefined();
    });

    it("should not contain external /memory link in primary nav", () => {
      const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
      const memoryItem = primaryGroup?.items.find((i) => i.url === "/memory");
      expect(memoryItem).toBeUndefined();
    });
  });

  describe("nested secondary actions", () => {
    it("should not have a separate Records group", () => {
      expect(sidebarItems.find((g) => g.label === "Records")).toBeUndefined();
    });

    it("Decisions subItems should include Decision Records", () => {
      const decisionsItem = sidebarItems
        .find((g) => g.label === "Primary")
        ?.items.find((i) => i.title === "Decisions");
      const decisionRecords = decisionsItem?.subItems?.find(
        (i) => i.title === "Decision Records"
      );
      expect(decisionRecords).toBeDefined();
      expect(decisionRecords?.url).toBe("/dashboard/decisions");
    });

    it("Decisions subItems should include Insight Builder", () => {
      const decisionsItem = sidebarItems
        .find((g) => g.label === "Primary")
        ?.items.find((i) => i.title === "Decisions");
      const insightBuilder = decisionsItem?.subItems?.find(
        (i) => i.title === "Insight Builder"
      );
      expect(insightBuilder).toBeDefined();
      expect(insightBuilder?.url).toBe("/dashboard/skills");
    });

    it("Settings subItems should include Preferences", () => {
      const settingsItem = sidebarItems
        .find((g) => g.label === "Primary")
        ?.items.find((i) => i.title === "Settings");
      const preferences = settingsItem?.subItems?.find(
        (i) => i.title === "Preferences"
      );
      expect(preferences).toBeDefined();
      expect(preferences?.url).toBe("/dashboard/settings");
    });

    it("Settings subItems should include System Health", () => {
      const settingsItem = sidebarItems
        .find((g) => g.label === "Primary")
        ?.items.find((i) => i.title === "Settings");
      const systemHealth = settingsItem?.subItems?.find(
        (i) => i.title === "System Health"
      );
      expect(systemHealth).toBeDefined();
      expect(systemHealth?.url).toBe("/dashboard/health");
    });
  });

  describe("secondary actions not in primary nav", () => {
    const primaryGroup = sidebarItems.find((g) => g.label === "Primary");

    it("should not have evidence in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Evidence")).toBeUndefined();
    });

    it("should not have graph in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Graph")).toBeUndefined();
    });

    it("should not have audit in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Audit")).toBeUndefined();
    });

    it("should not have health in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Health")).toBeUndefined();
    });

    it("should not have skills in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Skills")).toBeUndefined();
    });

    it("should not have memory-explorer in primary nav", () => {
      expect(primaryGroup?.items.find((i) => i.title === "Memory Explorer")).toBeUndefined();
    });
  });
});

describe("icon typing", () => {
  it("should use LucideIcon for all icons", () => {
    const primaryGroup = sidebarItems.find((g) => g.label === "Primary");
    const recordsGroup = sidebarItems.find((g) => g.label === "Records");

    expect(primaryGroup).toBeDefined();
    expect(recordsGroup).toBeUndefined();

    primaryGroup?.items.forEach((item) => {
      // Lucide icons are React forwardRef components at runtime.
      expect(item.icon).toBeDefined();
      if (item.subItems) {
        item.subItems.forEach((subItem) => {
          if (subItem.icon) {
            expect(subItem.icon).toBeDefined();
          }
        });
      }
    });
  });
});
