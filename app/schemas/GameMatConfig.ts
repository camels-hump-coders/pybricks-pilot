import { z } from "zod";

export const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const MissionObjectiveSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number().int().min(0),
  type: z.enum(["primary", "bonus"]).optional().default("primary"),
});

export const MissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: PointSchema,
  objectives: z.array(MissionObjectiveSchema),
  description: z.string().optional(),
  scoringMode: z.enum(["multi-select", "single-select"]).optional().default("multi-select"),
});

export const GameMatConfigSchema = z.object({
  version: z.literal("1.0"),
  name: z.string(),
  displayName: z.string().optional(),
  imageUrl: z.string().optional(), // Runtime-added for image loading
  rulebookUrl: z.string().optional(), // Runtime-added for rulebook access
  corners: z.object({
    topLeft: PointSchema,
    topRight: PointSchema,
    bottomLeft: PointSchema,
    bottomRight: PointSchema,
  }).optional(),
  missions: z.array(MissionSchema),
  dimensions: z.object({
    widthMm: z.number().positive(),
    heightMm: z.number().positive(),
  }),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Point = z.infer<typeof PointSchema>;
export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type GameMatConfig = z.infer<typeof GameMatConfigSchema>;