export interface User {
  id: string;
  email: string;
  name: string;
  password_hash: string;
  phone?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AdminUser {
  id: string;
  user_id: string;
  role: 'admin' | 'moderator';
  permissions: string[];
  created_at: Date;
}

export interface RefreshToken {
  id: string;
  user_id: string;
  token: string;
  expires_at: Date;
}

export interface GalleryCategory {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order?: number;
  created_at: Date;
}

export interface GalleryImage {
  id: string;
  category_id: string | null;
  image_url: string;
  title: string;
  description?: string;
  alt_text?: string | null;
  sort_order: number;
  is_featured: boolean;
  category_name?: string | null;
  category_slug?: string | null;
  created_at: Date;
}

/** GalleryCategory plus the aggregate the public listing returns. */
export interface GalleryCategoryWithCount {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  sort_order: number;
  image_count: number;
}

export interface NewsEvent {
  id: string;
  title: string;
  description?: string | null;
  event_date: string | null;
  event_time: string | null;
  end_time: string | null;
  location?: string | null;
  image_url?: string | null;
  event_type: string;
  age_groups?: string | null;
  is_published: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Facility {
  id: string;
  name: string;
  description: string;
  image_url?: string;
  location: string;
  created_at: Date;
}

export interface AgeGroup {
  id: string;
  name: string;
  min_age: number;
  max_age: number;
  created_at: Date;
}

/**
 * Matches the registrations table. It described first_name, last_name, email
 * and phone — none of which exist on it — so anything typed against this was
 * describing a row shape the database never returns.
 */
export interface Registration {
  id: string;
  child_name: string;
  child_dob: string;
  parent_name: string;
  parent_email: string;
  parent_phone: string;
  age_group_id: string | null;
  message: string | null;
  status: 'pending' | 'approved' | 'rejected';
  created_at: Date;
}

export interface TourBooking {
  id: string;
  visitor_name: string;
  email: string;
  phone: string;
  preferred_date: Date;
  time_slot: string;
  status: 'pending' | 'confirmed' | 'cancelled';
  created_at: Date;
}

export interface AuthPayload {
  email: string;
  password: string;
}

export interface RegisterPayload {
  email: string;
  password: string;
  name: string;
}

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}
