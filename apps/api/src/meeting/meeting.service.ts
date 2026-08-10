import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Meeting, MeetingParticipant, User } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMeetingDto } from './dto/create-meeting.dto';

type MeetingWithParticipants = Meeting & {
  participants: (MeetingParticipant & { user: User })[];
};

const participantsInclude = {
  participants: { include: { user: true } },
} as const;

@Injectable()
export class MeetingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(ownerId: string, dto: CreateMeetingDto) {
    const emails = [...new Set(dto.participants)];
    const users = await this.resolveParticipantUsers(emails);

    const meeting = await this.prisma.meeting.create({
      data: {
        title: dto.title,
        date: dto.date,
        ownerId,
        participants: {
          create: users.map((user) => ({ userId: user.id })),
        },
      },
      include: participantsInclude,
    });

    return this.toResponse(meeting, ownerId);
  }

  async findAllForUser(userId: string) {
    const meetings = await this.prisma.meeting.findMany({
      where: {
        OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
      },
      include: participantsInclude,
    });

    return meetings.map((meeting) => this.toResponse(meeting, userId));
  }

  async findOne(id: string, userId: string) {
    const meeting = await this.prisma.meeting.findFirst({
      where: {
        id,
        OR: [{ ownerId: userId }, { participants: { some: { userId } } }],
      },
      include: participantsInclude,
    });
    if (!meeting) {
      throw new NotFoundException('Meeting not found');
    }
    return this.toResponse(meeting, userId);
  }

  private async resolveParticipantUsers(emails: string[]) {
    const users = await this.prisma.user.findMany({
      where: { email: { in: emails } },
    });

    const foundEmails = new Set(users.map((user) => user.email));
    const unknownEmails = emails.filter((email) => !foundEmails.has(email));
    if (unknownEmails.length > 0) {
      throw new BadRequestException(
        `No registered user found for: ${unknownEmails.join(', ')}`,
      );
    }

    return users;
  }

  private toResponse(meeting: MeetingWithParticipants, userId: string) {
    const { participants, ...rest } = meeting;
    const myParticipation = participants.find((p) => p.userId === userId);

    return {
      ...rest,
      participants: participants.map((p) => ({
        userId: p.userId,
        email: p.user.email,
        status: p.status,
      })),
      role: meeting.ownerId === userId ? 'OWNER' : 'PARTICIPANT',
      myStatus: myParticipation ? myParticipation.status : null,
    };
  }
}
