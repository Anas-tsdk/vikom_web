using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;
using Microsoft.AspNetCore.Identity.EntityFrameworkCore;
using backend.Models;

namespace backend.DAL
{
    public class ApplicationDbContext : IdentityDbContext<User>
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) 
        { 
        }

        public DbSet<Availability> Availabilities => Set<Availability>();
        public DbSet<AvailabilityWindow> AvailabilityWindows => Set<AvailabilityWindow>();
        public DbSet<Appointment> Appointments => Set<Appointment>();
        public DbSet<PatientUserLink> PatientUserLinks => Set<PatientUserLink>();
        public DbSet<CallLog> CallLogs => Set<CallLog>();
        public DbSet<Visit> Visits => Set<Visit>();
        public DbSet<VisitTask> VisitTasks => Set<VisitTask>();
        public DbSet<PatientMedication> PatientMedications => Set<PatientMedication>();

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);

            // Patient URL handle is unique when present (SQLite treats NULLs as
            // distinct, so patients without one don't collide).
            modelBuilder.Entity<User>()
                .HasIndex(u => u.ProfileUsername)
                .IsUnique();

            // One backend patient per Supabase profile, which is what lets
            // GetBySupabaseProfileIdAsync resolve a TV caller to exactly one user.
            //
            // The database has carried this index since the AddSupabaseProfileId
            // migration, but the model had lost it — so EnsureCreated-built
            // databases (tests) went without it, and the next scaffolded migration
            // would have tried to drop it. Declared here so model and schema agree.
            modelBuilder.Entity<User>()
                .HasIndex(u => u.SupabaseProfileId)
                .IsUnique();

            // Configure one-to-one relationship between Appointment and Availability
            modelBuilder.Entity<Appointment>()
                .HasOne(a => a.Availability)
                .WithOne(av => av.Appointment)
                .HasForeignKey<Appointment>(a => a.AvailabilityId)
                .OnDelete(DeleteBehavior.Cascade);

            // Configure one-to-many relationship between AvailabilityWindow and Availability
            modelBuilder.Entity<AvailabilityWindow>()
                .HasMany(w => w.Slots)
                .WithOne(a => a.AvailabilityWindow)
                .HasForeignKey(a => a.AvailabilityWindowId)
                .OnDelete(DeleteBehavior.Cascade);

            // CallLog has two FKs to AspNetUsers (patient + personnel); use Restrict
            // to avoid multiple cascade paths on the same table.
            modelBuilder.Entity<CallLog>()
                .HasOne(c => c.Patient)
                .WithMany()
                .HasForeignKey(c => c.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<CallLog>()
                .HasOne(c => c.Personnel)
                .WithMany()
                .HasForeignKey(c => c.PersonnelId)
                .OnDelete(DeleteBehavior.Restrict);

            // Visit links to its source appointment one-to-one. Restrict so a
            // cancelled appointment can't silently take its visit history with it.
            modelBuilder.Entity<Visit>()
                .HasOne(v => v.Appointment)
                .WithOne(a => a.Visit)
                .HasForeignKey<Visit>(v => v.AppointmentId)
                .OnDelete(DeleteBehavior.Restrict);

            // Visit FKs to AspNetUsers (patient + responsible nurse); Restrict
            // to avoid multiple cascade paths on the same table.
            modelBuilder.Entity<Visit>()
                .HasOne(v => v.Patient)
                .WithMany()
                .HasForeignKey(v => v.PatientId)
                .OnDelete(DeleteBehavior.Restrict);

            modelBuilder.Entity<Visit>()
                .HasOne(v => v.ResponsibleUser)
                .WithMany()
                .HasForeignKey(v => v.ResponsibleUserId)
                .OnDelete(DeleteBehavior.Restrict);

            // Visit owns its tasks; removing a visit removes its task rows.
            modelBuilder.Entity<Visit>()
                .HasMany(v => v.Tasks)
                .WithOne(t => t.Visit)
                .HasForeignKey(t => t.VisitId)
                .OnDelete(DeleteBehavior.Cascade);

            // A call attempt may belong to a visit; keep the call log if the
            // visit is ever removed (set null rather than cascade).
            modelBuilder.Entity<CallLog>()
                .HasOne(c => c.Visit)
                .WithMany()
                .HasForeignKey(c => c.VisitId)
                .OnDelete(DeleteBehavior.SetNull);

            // A patient owns their medication list; remove rows with the patient.
            modelBuilder.Entity<PatientMedication>()
                .HasOne(m => m.Patient)
                .WithMany(u => u.Medications)
                .HasForeignKey(m => m.PatientId)
                .OnDelete(DeleteBehavior.Cascade);

            // We persist DateTimes as UTC (DateTime.UtcNow), but SQLite returns
            // them with Kind=Unspecified — which serializes WITHOUT a trailing
            // 'Z', so the client reads them as local time (e.g. the Økt timer
            // starting hours in for UTC+offset users). Mark every DateTime as
            // UTC on read so it serializes with 'Z' and the client parses it
            // correctly. (Round-trip to the DB is unchanged.)
            var utcConverter = new ValueConverter<DateTime, DateTime>(
                v => v,
                v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
            var utcNullableConverter = new ValueConverter<DateTime?, DateTime?>(
                v => v,
                v => v.HasValue ? DateTime.SpecifyKind(v.Value, DateTimeKind.Utc) : v);

            foreach (var entityType in modelBuilder.Model.GetEntityTypes())
            {
                foreach (var property in entityType.GetProperties())
                {
                    if (property.ClrType == typeof(DateTime))
                        property.SetValueConverter(utcConverter);
                    else if (property.ClrType == typeof(DateTime?))
                        property.SetValueConverter(utcNullableConverter);
                }
            }
        }
    }
}
