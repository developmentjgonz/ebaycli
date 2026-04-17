using EbayStoreManager.Api.Data;
using Microsoft.EntityFrameworkCore;

namespace EbayStoreManager.Api.Services;

public sealed class AppDbInitializer(AppDbContext dbContext)
{
    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        await dbContext.Database.EnsureCreatedAsync(cancellationToken);

        if (dbContext.Database.IsSqlServer())
        {
            await dbContext.Database.ExecuteSqlRawAsync("""
                IF OBJECT_ID(N'LocalEbayAuthStates', N'U') IS NULL
                BEGIN
                    CREATE TABLE [LocalEbayAuthStates] (
                        [Id] uniqueidentifier NOT NULL PRIMARY KEY,
                        [State] nvarchar(200) NOT NULL,
                        [Environment] nvarchar(20) NOT NULL,
                        [MarketplaceId] nvarchar(50) NOT NULL,
                        [CallbackUrl] nvarchar(500) NOT NULL,
                        [ExchangeCodeHash] nvarchar(128) NULL,
                        [AccessTokenCipher] nvarchar(max) NULL,
                        [RefreshTokenCipher] nvarchar(max) NULL,
                        [AccessTokenExpiresAtUtc] datetimeoffset NULL,
                        [RefreshTokenExpiresAtUtc] datetimeoffset NULL,
                        [Scope] nvarchar(1000) NULL,
                        [TokenType] nvarchar(50) NULL,
                        [EbayUserId] nvarchar(100) NULL,
                        [EbayUsername] nvarchar(200) NULL,
                        [AccountType] nvarchar(50) NULL,
                        [SellerRegistrationCompleted] bit NULL,
                        [CreatedAtUtc] datetimeoffset NOT NULL,
                        [ExpiresAtUtc] datetimeoffset NOT NULL,
                        [CompletedAtUtc] datetimeoffset NULL,
                        [ConsumedAtUtc] datetimeoffset NULL
                    );
                    CREATE UNIQUE INDEX [IX_LocalEbayAuthStates_State] ON [LocalEbayAuthStates] ([State]);
                END
                """, cancellationToken);
            return;
        }

        if (dbContext.Database.IsSqlite())
        {
            await dbContext.Database.ExecuteSqlRawAsync("""
                CREATE TABLE IF NOT EXISTS "LocalEbayAuthStates" (
                    "Id" TEXT NOT NULL CONSTRAINT "PK_LocalEbayAuthStates" PRIMARY KEY,
                    "State" TEXT NOT NULL,
                    "Environment" TEXT NOT NULL,
                    "MarketplaceId" TEXT NOT NULL,
                    "CallbackUrl" TEXT NOT NULL,
                    "ExchangeCodeHash" TEXT NULL,
                    "AccessTokenCipher" TEXT NULL,
                    "RefreshTokenCipher" TEXT NULL,
                    "AccessTokenExpiresAtUtc" TEXT NULL,
                    "RefreshTokenExpiresAtUtc" TEXT NULL,
                    "Scope" TEXT NULL,
                    "TokenType" TEXT NULL,
                    "EbayUserId" TEXT NULL,
                    "EbayUsername" TEXT NULL,
                    "AccountType" TEXT NULL,
                    "SellerRegistrationCompleted" INTEGER NULL,
                    "CreatedAtUtc" TEXT NOT NULL,
                    "ExpiresAtUtc" TEXT NOT NULL,
                    "CompletedAtUtc" TEXT NULL,
                    "ConsumedAtUtc" TEXT NULL
                );
                CREATE UNIQUE INDEX IF NOT EXISTS "IX_LocalEbayAuthStates_State" ON "LocalEbayAuthStates" ("State");
                """, cancellationToken);
        }
    }
}
