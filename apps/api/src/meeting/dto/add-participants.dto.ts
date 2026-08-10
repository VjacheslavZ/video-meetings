import { ArrayNotEmpty, IsArray, IsEmail } from 'class-validator';

export class AddParticipantsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsEmail({}, { each: true })
  participants: string[];
}
