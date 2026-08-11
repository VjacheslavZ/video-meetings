-- CreateTable
CREATE TABLE "meeting_file" (
    "id" TEXT NOT NULL,
    "meetingId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "meeting_file_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "meeting_file_storedName_key" ON "meeting_file"("storedName");

-- CreateIndex
CREATE INDEX "meeting_file_meetingId_idx" ON "meeting_file"("meetingId");

-- CreateIndex
CREATE INDEX "meeting_file_uploadedById_idx" ON "meeting_file"("uploadedById");

-- AddForeignKey
ALTER TABLE "meeting_file" ADD CONSTRAINT "meeting_file_meetingId_fkey" FOREIGN KEY ("meetingId") REFERENCES "meeting"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "meeting_file" ADD CONSTRAINT "meeting_file_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
