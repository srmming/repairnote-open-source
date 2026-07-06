-- CreateTable
CREATE TABLE `Staff` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `username` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `passwordHash` VARCHAR(255) NOT NULL,
    `isAdmin` BOOLEAN NOT NULL DEFAULT false,
    `pagePermissions` JSON NOT NULL,
    `sessionTokenHash` VARCHAR(255) NULL,
    `sessionExpiresAt` DATETIME(3) NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Staff_username_key`(`username`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `StaffSession` (
    `id` VARCHAR(191) NOT NULL,
    `staffId` VARCHAR(191) NOT NULL,
    `tokenHash` VARCHAR(255) NOT NULL,
    `expiresAt` DATETIME(3) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `StaffSession_tokenHash_key`(`tokenHash`),
    INDEX `StaffSession_staffId_idx`(`staffId`),
    INDEX `StaffSession_expiresAt_idx`(`expiresAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Client` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `docType` VARCHAR(191) NOT NULL DEFAULT 'DNI',
    `identity` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `address` TEXT NOT NULL,
    `comment` TEXT NOT NULL,
    `level` VARCHAR(191) NOT NULL DEFAULT 'VIP',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Client_name_idx`(`name`),
    INDEX `Client_phone_idx`(`phone`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Brand` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Brand_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Model` (
    `id` VARCHAR(191) NOT NULL,
    `brandId` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Model_brandId_idx`(`brandId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Service` (
    `id` VARCHAR(191) NOT NULL,
    `defaultName` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT '',
    `zh` TEXT NOT NULL,
    `es` TEXT NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Part` (
    `id` VARCHAR(191) NOT NULL,
    `defaultName` TEXT NOT NULL,
    `category` VARCHAR(191) NOT NULL DEFAULT '',
    `zh` TEXT NOT NULL,
    `es` TEXT NOT NULL,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Technician` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `phone` VARCHAR(191) NOT NULL DEFAULT '',
    `email` VARCHAR(191) NOT NULL DEFAULT '',
    `color` VARCHAR(191) NOT NULL DEFAULT '#16a34a',
    `active` BOOLEAN NOT NULL DEFAULT true,
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Technician_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `AttributeGroup` (
    `id` VARCHAR(191) NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `AttributeGroup_name_key`(`name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Attribute` (
    `id` VARCHAR(191) NOT NULL,
    `groupId` VARCHAR(191) NOT NULL,
    `defaultName` VARCHAR(191) NOT NULL,
    `zh` VARCHAR(191) NOT NULL DEFAULT '',
    `es` VARCHAR(191) NOT NULL DEFAULT '',
    `sortOrder` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Attribute_groupId_idx`(`groupId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Repair` (
    `id` VARCHAR(191) NOT NULL,
    `ticket` VARCHAR(191) NOT NULL,
    `clientId` VARCHAR(191) NOT NULL,
    `brand` VARCHAR(191) NOT NULL DEFAULT '',
    `model` VARCHAR(191) NOT NULL DEFAULT '',
    `properties` TEXT NOT NULL,
    `imei` VARCHAR(191) NOT NULL DEFAULT '',
    `issue` TEXT NOT NULL,
    `internalNote` TEXT NOT NULL,
    `passwordType` VARCHAR(191) NOT NULL DEFAULT '',
    `passwordText` VARCHAR(191) NOT NULL DEFAULT '',
    `passwordPattern` JSON NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT '预定',
    `repairTime` VARCHAR(191) NOT NULL DEFAULT '',
    `warrantyStart` VARCHAR(191) NOT NULL DEFAULT '',
    `technicianId` VARCHAR(191) NOT NULL DEFAULT '',
    `technicianName` VARCHAR(191) NOT NULL DEFAULT '',
    `budget` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `deposit` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `paymentMethod` VARCHAR(191) NOT NULL DEFAULT 'none',
    `discountAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `costAmount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `frontPhoto` LONGTEXT NOT NULL,
    `backPhoto` LONGTEXT NOT NULL,
    `signatureDataUrl` LONGTEXT NOT NULL,
    `signedAt` VARCHAR(191) NOT NULL DEFAULT '',
    `publicToken` VARCHAR(191) NOT NULL,
    `orderType` VARCHAR(191) NOT NULL DEFAULT 'repair',
    `sourceRepairId` VARCHAR(191) NOT NULL DEFAULT '',
    `warrantyReason` TEXT NOT NULL,
    `warrantyDiagnosis` TEXT NOT NULL,
    `warrantyResolution` TEXT NOT NULL,
    `warrantyChargeable` BOOLEAN NOT NULL DEFAULT false,
    `statusHistory` JSON NOT NULL,
    `notificationLog` JSON NOT NULL,
    `searchText` TEXT NOT NULL,
    `ticketSort` BIGINT NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Repair_ticket_key`(`ticket`),
    UNIQUE INDEX `Repair_publicToken_key`(`publicToken`),
    INDEX `Repair_clientId_idx`(`clientId`),
    INDEX `Repair_orderType_idx`(`orderType`),
    INDEX `Repair_sourceRepairId_idx`(`sourceRepairId`),
    INDEX `Repair_status_idx`(`status`),
    INDEX `Repair_repairTime_idx`(`repairTime`),
    INDEX `Repair_createdAt_idx`(`createdAt`),
    INDEX `Repair_ticketSort_idx`(`ticketSort`),
    INDEX `Repair_technicianId_idx`(`technicianId`),
    INDEX `Repair_technicianName_idx`(`technicianName`),
    FULLTEXT INDEX `Repair_searchText_idx`(`searchText`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RepairItem` (
    `id` VARCHAR(191) NOT NULL,
    `repairId` VARCHAR(191) NOT NULL,
    `name` TEXT NOT NULL,
    `qty` DECIMAL(12, 3) NOT NULL DEFAULT 1,
    `price` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `cost` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `RepairItem_repairId_idx`(`repairId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Payment` (
    `id` VARCHAR(191) NOT NULL,
    `repairId` VARCHAR(191) NOT NULL,
    `amount` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `method` VARCHAR(191) NOT NULL DEFAULT 'cash',
    `note` VARCHAR(191) NOT NULL DEFAULT '',
    `paidAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdBy` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Payment_repairId_idx`(`repairId`),
    INDEX `Payment_paidAt_idx`(`paidAt`),
    INDEX `Payment_method_idx`(`method`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Setting` (
    `id` VARCHAR(191) NOT NULL DEFAULT 'main',
    `value` JSON NOT NULL,
    `updatedAt` DATETIME(3) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `BackupSnapshot` (
    `id` VARCHAR(191) NOT NULL,
    `kind` VARCHAR(191) NOT NULL DEFAULT 'manual',
    `reason` VARCHAR(191) NOT NULL DEFAULT '',
    `data` JSON NOT NULL,
    `counts` JSON NOT NULL,
    `createdBy` VARCHAR(191) NOT NULL DEFAULT '',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `BackupSnapshot_createdAt_idx`(`createdAt`),
    INDEX `BackupSnapshot_kind_idx`(`kind`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `StaffSession` ADD CONSTRAINT `StaffSession_staffId_fkey` FOREIGN KEY (`staffId`) REFERENCES `Staff`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Model` ADD CONSTRAINT `Model_brandId_fkey` FOREIGN KEY (`brandId`) REFERENCES `Brand`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Attribute` ADD CONSTRAINT `Attribute_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `AttributeGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Repair` ADD CONSTRAINT `Repair_clientId_fkey` FOREIGN KEY (`clientId`) REFERENCES `Client`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RepairItem` ADD CONSTRAINT `RepairItem_repairId_fkey` FOREIGN KEY (`repairId`) REFERENCES `Repair`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Payment` ADD CONSTRAINT `Payment_repairId_fkey` FOREIGN KEY (`repairId`) REFERENCES `Repair`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

