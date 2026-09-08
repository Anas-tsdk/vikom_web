using backend.DAL.Repositories;
using backend.DTOs;
using backend.Models;

namespace backend.Services
{
    public class PatientUserLinkService : IPatientUserLinkService
    {
        private readonly IPatientUserLinkRepository _repository;

        public PatientUserLinkService(IPatientUserLinkRepository repository)
        {
            _repository = repository;
        }

        public async Task<IEnumerable<PatientUserLinkDto>> GetAllAsync()
        {
            var links = await _repository.GetAllAsync();
            return links.Select(MapToDto);
        }

        public async Task<PatientUserLinkDto?> GetByIdAsync(int id)
        {
            var link = await _repository.GetByIdAsync(id);
            return link != null ? MapToDto(link) : null;
        }

        public async Task<IEnumerable<PatientUserLinkDto>> GetByPatientIdAsync(string patientId)
        {
            var links = await _repository.GetByPatientIdAsync(patientId);
            return links.Select(MapToDto);
        }

        public async Task<IEnumerable<PatientUserLinkDto>> GetBySecondaryUserIdAsync(string secondaryUserId)
        {
            var links = await _repository.GetBySecondaryUserIdAsync(secondaryUserId);
            return links.Select(MapToDto);
        }

        public async Task<PatientUserLinkDto> CreateAsync(string patientId, string secondaryUserId, string relationshipType)
        {
            var link = new PatientUserLink
            {
                PatientId = patientId,
                SecondaryUserId = secondaryUserId,
                RelationshipType = relationshipType
            };

            var created = await _repository.CreateAsync(link);
            return MapToDto(created);
        }

        public async Task<bool> DeleteAsync(int id)
        {
            return await _repository.DeleteAsync(id);
        }

        private static PatientUserLinkDto MapToDto(PatientUserLink link)
        {
            return new PatientUserLinkDto
            {
                Id = link.Id,
                PatientId = link.PatientId,
                PatientName = link.Patient.FullName,
                SecondaryUserId = link.SecondaryUserId,
                SecondaryUserName = link.SecondaryUser.FullName,
                RelationshipType = link.RelationshipType
            };
        }
    }
}