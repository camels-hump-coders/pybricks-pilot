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
  // Removed top-level points - all points are now in choices
  // All objectives must have choices array (even if just one choice)
  choices: z.array(MissionObjectiveChoiceSchema).min(1),
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
export type MissionObjectiveChoice = z.infer<
  typeof MissionObjectiveChoiceSchema
>;
export type MissionObjective = z.infer<typeof MissionObjectiveSchema>;
export type Mission = z.infer<typeof MissionSchema>;
export type GameMatConfig = z.infer<typeof GameMatConfigSchema>;
