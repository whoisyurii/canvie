import { Circle, Text, Group } from "react-konva";
import { User } from "@/lib/store/useWhiteboardStore";

interface UserCursorProps {
  user: User;
  pan: { x: number; y: number };
  zoom: number;
}

export const UserCursor = ({ user, pan, zoom }: UserCursorProps) => {
  const x = (user.cursorX - pan.x) / zoom;
  const y = (user.cursorY - pan.y) / zoom;

  return (
    <Group x={x} y={y}>
      <Circle radius={6} fill={user.color} shadowBlur={4} shadowOpacity={0.5} />
      <Text
        text={user.name}
        x={10}
        y={-5}
        fontSize={12}
        fill={user.color}
        fontStyle="bold"
        shadowColor="rgba(0,0,0,0.3)"
        shadowBlur={2}
      />
    </Group>
  );
};
