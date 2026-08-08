import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

@Injectable()
export class MeetingService {
  constructor(private readonly prisma: PrismaService) {}

  create(ownerId: string, dto: CreateMeetingDto) {
    return this.prisma.meeting.create({
      data: {
        title: dto.title,
        date: dto.date,
        participants: dto.participants,
        ownerId,
      },
    });
  }

  findAllForUser(ownerId: string) {
    return this.prisma.meeting.findMany({ where: { ownerId } });
  }

  async findOne(id: string, ownerId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: { id, ownerId },
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return meeting;
  }
}
