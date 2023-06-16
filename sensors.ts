import { z } from "zod";

export const SensorSchema = z.object({
  query: z.string(),
  which_sensor: z.enum(["activity", "channel", "past"]),
});

const useSensors = async (parameters: z.infer<typeof SensorSchema>) => {
  const { query, which_sensor } = parameters;

  console.log(`Querying ${which_sensor} sensor for ${query}`);
};

export { useSensors };
