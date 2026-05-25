export type Role = "MEMBER" | "PERSONAL" | "NUTRITIONIST" | "ADMIN";
export type VerificationStatus = "NOT_REQUIRED" | "PENDING" | "VERIFIED" | "REJECTED";

export type User = {
  id: string;
  name: string;
  email: string;
  role: Role;
  avatarUrl?: string;
  bio?: string;
  goal: string;
  location?: string;
  isFollowing?: boolean;
  professionalKind?: "PERSONAL" | "NUTRITIONIST";
  verificationStatus?: VerificationStatus;
  credential?: string;
  documentUrl?: string;
  subscriptionPlan?: string;
  subscriptionStatus?: string;
};

export type Post = {
  id: string;
  title: string;
  content: string;
  workout?: string;
  type: string;
  createdAt: string;
  author: User;
  comments: { id: string; content: string; author: User }[];
  likeCount: number;
  likedByMe: boolean;
};

export type Message = {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  createdAt: string;
};

export type Plan = {
  id: string;
  title: string;
  kind: string;
  content: string;
  createdAt: string;
  author?: User;
};

export type Appointment = {
  id: string;
  title: string;
  startsAt: string;
  status: string;
  notes?: string;
  professional: User;
  member: User;
};
