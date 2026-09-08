// Authentication DTOs

// Login DTO
export interface LoginDto {
  userName: string;
  password: string;
}

// Register DTO - matches backend RegisterDto structure
export interface RegisterDto {
  userName: string;
  email: string;
  password: string;
  fullName: string;
  phoneNumber?: string;
  address?: string;
}
