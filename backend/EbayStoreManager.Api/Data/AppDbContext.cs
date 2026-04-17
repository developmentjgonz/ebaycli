using EbayStoreManager.Api.Domain;
using Microsoft.EntityFrameworkCore;

namespace EbayStoreManager.Api.Data;

public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<LocalEbayAuthState> LocalEbayAuthStates => Set<LocalEbayAuthState>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<LocalEbayAuthState>(entity =>
        {
            entity.HasKey(x => x.Id);
            entity.HasIndex(x => x.State).IsUnique();
            entity.Property(x => x.State).HasMaxLength(200);
            entity.Property(x => x.Environment).HasMaxLength(20);
            entity.Property(x => x.MarketplaceId).HasMaxLength(50);
            entity.Property(x => x.CallbackUrl).HasMaxLength(500);
            entity.Property(x => x.ExchangeCodeHash).HasMaxLength(128);
            entity.Property(x => x.Scope).HasMaxLength(1000);
            entity.Property(x => x.TokenType).HasMaxLength(50);
            entity.Property(x => x.EbayUserId).HasMaxLength(100);
            entity.Property(x => x.EbayUsername).HasMaxLength(200);
            entity.Property(x => x.AccountType).HasMaxLength(50);
        });
    }
}
