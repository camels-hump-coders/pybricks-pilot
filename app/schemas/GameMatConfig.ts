import { z } from "zod";

const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

const MissionObjectiveChoiceSchema = z.object({
  id: z.string(),
  description: z.string(),
  points: z.number().int().min(0),
  type: z.enum(["primary", "bonus"]).optional().default("primary"),
});

const MissionObjectiveSchema = z.object({
  id: z.string(),
  description: z.string().optional(),
  // Legacy support for backward compatibility
  points: z.number().int().min(0).optional(),
  type: z.enum(["primary", "bonus"]).optional(),
  // All objectives must have choices array (even if just one choice)
  choices: z.array(MissionObjectiveChoiceSchema).min(1),
  // Scoring mode for the objective
  scoringMode: z.enum(["multi-select", "single-select"]).optional().default("multi-select"),
});

const MissionSchema = z.object({
  id: z.string(),
  name: z.string(),
  position: PointSchema,
  objectives: z.array(MissionObjectiveSchema),
  description: z.string().optional(),
});

export const GameMatConfigSchema = z.object({
  version: z.literal("1.0"),
  name: z.string(),
  displayName: z.string().optional(),
  imageUrl: z.string().optional(), // Runtime-added for image loading
  rulebookUrl: z.string().optional(), // Runtime-added for rulebook access
  imageData: z.string().optional(), // Base64 image data
  originalImageData: z.string().optional(), // Original image data before transformation
  corners: z
    .object({
      topLeft: PointSchema,
      topRight: PointSchema,
      bottomLeft: PointSchema,
      bottomRight: PointSchema,
    })
    .optional(),
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
